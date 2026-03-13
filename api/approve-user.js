// api/approve-user.js
// Vercel Serverless Function - Admin approves signup request
// Creates actual Supabase auth user via Admin API

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify admin token
    const auth = req.headers.authorization?.split(' ')[1];
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { createClient } = await import('@supabase/supabase-js');

    const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY, // Service role key (server-side only!)
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the requesting user is admin
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(auth);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ error: 'requestId required' });

    // Get signup request
    const { data: request, error: reqErr } = await supabaseAdmin
        .from('signup_requests')
        .select('*')
        .eq('id', requestId)
        .eq('status', 'pending')
        .single();

    if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });

    // Create auth user
    const password = atob(request.password_hash); // decode base64
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: request.email,
        password: password,
        email_confirm: true,
        user_metadata: {
            username: request.username,
            display_name: request.display_name
        }
    });

    if (createErr) {
        return res.status(400).json({ error: createErr.message });
    }

    // Update profile (trigger should handle this but just in case)
    await supabaseAdmin.from('profiles').upsert({
        id: newUser.user.id,
        username: request.username,
        display_name: request.display_name,
        role: 'user'
    });

    // Mark request approved
    await supabaseAdmin.from('signup_requests').update({
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
    }).eq('id', requestId);

    // Send notification email via Supabase (built-in)
    // Supabase automatically sends confirmation email

    return res.status(200).json({ success: true, userId: newUser.user.id });
}
