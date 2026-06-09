const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

console.log('SUPABASE_URL:', supabaseUrl);
console.log('SUPABASE_KEY exists:', !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*');
    if (error) throw error;
    console.log('Accounts in DB:', accounts);
  } catch (err) {
    console.error('Error fetching accounts:', err.message);
  }
}

check();
