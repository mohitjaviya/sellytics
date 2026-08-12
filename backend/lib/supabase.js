const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://qsddhxtbssnqbfdjdsjz.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_key_placeholder';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
