require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function createAdmin() {
  const email    = 'admin@sellytics.com';
  const password = 'Admin@123';

  console.log(`Creating admin user: ${email}`);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,          // skip email verification
    user_metadata: { role: 'Admin', name: 'Admin User' },
    app_metadata:  { role: 'Admin' },
  });

  if (error) {
    // If user already exists, update their password instead
    if (error.message.includes('already')) {
      console.log('User already exists — updating password...');
      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users?.users?.find(u => u.email === email);
      if (existing) {
        const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
          password,
          user_metadata: { role: 'Admin', name: 'Admin User' },
          app_metadata:  { role: 'Admin' },
        });
        if (updateErr) {
          console.error('❌ Failed to update user:', updateErr.message);
        } else {
          console.log('✅ Password updated successfully!');
          console.log(`\n📧 Email:    ${email}`);
          console.log(`🔑 Password: ${password}`);
        }
      }
    } else {
      console.error('❌ Error:', error.message);
    }
    return;
  }

  console.log('✅ Admin user created!');
  console.log(`\n📧 Email:    ${email}`);
  console.log(`🔑 Password: ${password}`);
  console.log(`👤 User ID:  ${data.user.id}`);
}

createAdmin().catch(console.error);
