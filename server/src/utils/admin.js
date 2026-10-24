export const ADMIN_ROLES = ['admin', 'council_admin'];
export const publicAdmin = (user) => ({
  id: String(user._id), fullName: user.fullName, role: 'admin', status: user.status,
  createdAt: user.createdAt, updatedAt: user.updatedAt,
});
