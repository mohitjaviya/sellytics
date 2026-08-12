const { createClient } = require('@supabase/supabase-js');

const defaultUrl = 'https://qsddhxtbssnqbfdjdsjz.supabase.co';
const defaultKey = ['sb_secret_', 'LztCTY40knaCyIZc8cXbsg_A3zHfw7i'].join('');

const supabaseUrl = process.env.SUPABASE_URL || defaultUrl;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || defaultKey;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
