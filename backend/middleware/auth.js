const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // For now, if no token is provided, we might still allow it for development,
    // but we should enforce it. To avoid breaking things instantly if a token is missing,
    // we can attach a default "Admin" role if we are in local dev, OR strict enforce.
    // Let's strictly enforce, but if it fails, return 401.
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const role = user.user_metadata?.role || user.app_metadata?.role || 'Sales Executive';
  
  req.user = {
    id: user.id,
    email: user.email,
    role: role,
    assignments: { cities: [], accounts: [] }
  };

  // If Sales Executive, fetch their assignments
  if (role === 'Sales Executive') {
    const { data: assignments, error: assignErr } = await supabase
      .from('user_assignments')
      .select('assignment_type, assignment_value')
      .eq('user_id', user.id);

    if (!assignErr && assignments) {
      req.user.assignments.cities = assignments.filter(a => a.assignment_type === 'city').map(a => a.assignment_value);
      req.user.assignments.accounts = assignments.filter(a => a.assignment_type === 'account').map(a => a.assignment_value);
    }
  }

  next();
}

module.exports = authMiddleware;
