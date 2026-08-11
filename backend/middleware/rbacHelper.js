/**
 * rbacHelper.js
 * Applies Role-Based Access Control filters to Supabase query builders.
 */

function applyRbac(query, reqUser, table = 'sales_orders') {
  if (!reqUser) return query; // If auth is skipped or no user
  
  if (reqUser.role === 'Sales Executive') {
    const { cities = [], accounts = [] } = reqUser.assignments || {};
    
    // If the table has city and account_id (e.g. sales_orders, targets)
    if (['sales_orders', 'targets'].includes(table)) {
      // Supabase doesn't easily support dynamic OR across multiple columns with arrays cleanly using the simple builder,
      // so we use an or() filter. But actually, if they are assigned to cities AND accounts, 
      // does a sale need to match BOTH or EITHER? Usually it's an OR condition: 
      // (city in cities OR account_id in accounts).
      
      const conditions = [];
      if (cities.length > 0) {
        conditions.push(`city.in.(${cities.map(c => `"${c}"`).join(',')})`);
      }
      if (accounts.length > 0) {
        conditions.push(`account_id.in.(${accounts.map(a => `"${a}"`).join(',')})`);
      }
      
      if (conditions.length > 0) {
        query = query.or(conditions.join(','));
      } else {
        // Sales Executive with NO assignments should see nothing
        // Easiest way to return empty is an impossible condition
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    }
  }
  
  return query;
}

module.exports = { applyRbac };
