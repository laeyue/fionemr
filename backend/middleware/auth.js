// Role-Based Access Control (RBAC) Middleware

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // In a real scenario, the user's role would be attached to req.user by a previous auth middleware (e.g. Supabase JWT verifier)
    const userRole = req.user?.role || 'guest';

    if (!allowedRoles.includes(userRole)) {
      // Log this access denial to Audit Logs for DPA compliance
      console.warn(`[AUDIT] Unauthorized access attempt by role: ${userRole}`);
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

module.exports = { requireRole };
