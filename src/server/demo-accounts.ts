/**
 * Demo-only accounts created by `npm run seed`. These passwords are public
 * on purpose (shown on the login page in demo mode) and the accounts are
 * never created, nor accepted for admin access, in production.
 */
export const DEMO_LOGIN = {
  family: { email: "riya@demo.khairiyat.app", password: "khairiyat-demo", name: "Riya Sharma" },
  sibling: { email: "rohan@demo.khairiyat.app", password: "khairiyat-demo", name: "Rohan Sharma" },
  admin: {
    email: "admin@demo.khairiyat.app",
    password: "khairiyat-admin-demo",
    name: "Arham (admin)",
  },
} as const;
