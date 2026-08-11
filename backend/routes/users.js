const express = require('express');
const router  = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Admin/Manager only middleware for this router
router.use((req, res, next) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
    return res.status(403).json({ error: 'Forbidden: Admin or Manager role required' });
  }
  next();
});

// ── GET /api/users ────────────────────────────────────────────────────────────
// Fetches all users from auth.users (via Admin API) and their assignments
router.get('/', async (req, res) => {
  // Fetch users
  const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) return res.status(500).json({ error: authErr.message });

  // Fetch all assignments
  const { data: assignments, error: assignErr } = await supabase
    .from('user_assignments')
    .select('*');
  if (assignErr) return res.status(500).json({ error: assignErr.message });

  // Map assignments to users
  const formattedUsers = users.map(u => {
    const userAssignments = assignments.filter(a => a.user_id === u.id);
    return {
      id: u.id,
      email: u.email,
      name: u.user_metadata?.name || u.email.split('@')[0],
      role: u.user_metadata?.role || u.app_metadata?.role || 'Sales Executive',
      created_at: u.created_at,
      assignments: {
        cities: userAssignments.filter(a => a.assignment_type === 'city').map(a => a.assignment_value),
        accounts: userAssignments.filter(a => a.assignment_type === 'account').map(a => a.assignment_value),
      }
    };
  });

  res.json(formattedUsers);
});

// ── POST /api/users/:id/assignments ───────────────────────────────────────────
// Updates assignments for a specific user. Expects { cities: [], accounts: [] }
router.post('/:id/assignments', async (req, res) => {
  const userId = req.params.id;
  const { cities = [], accounts = [] } = req.body;

  // 1. Delete existing assignments
  const { error: delErr } = await supabase
    .from('user_assignments')
    .delete()
    .eq('user_id', userId);
  
  if (delErr) return res.status(500).json({ error: delErr.message });

  // 2. Insert new assignments
  const newAssignments = [
    ...cities.map(city => ({ user_id: userId, assignment_type: 'city', assignment_value: city })),
    ...accounts.map(acc => ({ user_id: userId, assignment_type: 'account', assignment_value: acc }))
  ];

  if (newAssignments.length > 0) {
    const { error: insErr } = await supabase
      .from('user_assignments')
      .insert(newAssignments);
    
    if (insErr) return res.status(500).json({ error: insErr.message });
  }

  res.json({ success: true });
});

module.exports = router;
