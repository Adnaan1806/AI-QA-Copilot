import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useAuth } from "../context/AuthContext";
import Spinner from "../motion/Spinner";
import { useButtonPress } from "../motion/useButtonPress";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-teal-500 dark:focus:bg-slate-950 dark:focus:ring-teal-500/20";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const logoRef = useRef(null);
  const cardRef = useRef(null);
  const submitPress = useButtonPress();

  useGSAP(() => {
    gsap
      .timeline()
      .from(logoRef.current, { opacity: 0, y: -8, scale: 0.9, duration: 0.35, ease: "back.out(1.6)" })
      .from(cardRef.current, { opacity: 0, y: 12, duration: 0.35, ease: "power2.out" }, "-=0.15");
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({ name, email, password });
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
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-base font-bold text-white shadow-sm shadow-teal-600/30">
          Q
        </div>
        <span className="text-lg font-semibold text-gray-900 dark:text-white">
          AI QA Copilot
        </span>
      </div>

      <form
        ref={cardRef}
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          Create an account
        </h1>

        <input
          type="text"
          required
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />

        <button
          ref={submitPress.ref}
          {...submitPress.handlers}
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading && <Spinner className="h-4 w-4" />}
          {loading ? "Creating account..." : "Create account"}
        </button>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-teal-600 hover:underline dark:text-teal-400"
          >
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
