// Redirects to Dashboard - this file kept for compatibility
import { Redirect } from "wouter";

export default function Home() {
  return <Redirect to="/" />;
}
