// js/core/auth.js (add this near top of renderLogin)
export function renderLogin() {
  // Ensure at least one user exists (create default admin)
  const users = DB.getAll('users');
  if (!users || users.length === 0) {
    DB.add('users', {
      name: 'Admin',
      role: 'admin',
      active: true,
      pin: '1234',
      branchId: null
    });
    console.log('Created default admin user');
    // Re-fetch users after adding
    var updatedUsers = DB.getAll('users');
  } else {
    var updatedUsers = users;
  }
  // ... rest of the function using updatedUsers
}
