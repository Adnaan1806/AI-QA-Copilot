import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import Spinner from "../motion/Spinner";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const logoRef = useRef(null);
  const cardRef = useRef(null);

  useGSAP(() => {
    gsap
      .timeline()
      .from(logoRef.current, {
        opacity: 0,
        y: -8,
        scale: 0.9,
        duration: 0.35,
        ease: "back.out(1.6)",
      })
      .from(cardRef.current, { opacity: 0, y: 12, duration: 0.35, ease: "power2.out" }, "-=0.15");
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ email, password });
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <div ref={logoRef} className="mb-8 flex items-center justify-center gap-2.5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-linear-to-br from-primary to-emerald-500 text-base font-bold text-white shadow-sm shadow-primary/30">
          Q
        </div>
        <span className="text-lg font-semibold text-foreground">AI QA Copilot</span>
      </div>

      <Card ref={cardRef}>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Log in</h1>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full gap-2 bg-linear-to-r from-primary to-emerald-500 text-white hover:opacity-90"
            >
              {loading && <Spinner className="h-4 w-4" />}
              {loading ? "Logging in..." : "Log in"}
            </Button>

            {error && (
              <p className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/register" className="font-medium text-primary hover:underline">
                Register
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
