// Home.tsx is not used directly - Dashboard is the landing page.
// Kept for compatibility with template expectations.

import { Redirect } from "wouter";

export default function Home() {
  return <Redirect to="/" />;
}
