import { Link, NavLink, useNavigate } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { useButtonPress } from "../motion/useButtonPress";

const linkClass = ({ isActive }) =>
  `px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
    isActive
      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
      : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-white"
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const logoutPress = useButtonPress();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-3.5">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm shadow-indigo-600/30">
            Q
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">
            AI QA Copilot
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-full bg-gray-100/70 p-1 dark:bg-slate-900/70">
            <NavLink to="/" end className={linkClass}>
              Projects
            </NavLink>
            <NavLink to="/history" className={linkClass}>
              History
            </NavLink>
          </div>
          <ThemeToggle />
          {user && (
            <div className="flex items-center gap-2 pl-1">
              <span className="hidden text-sm text-gray-500 dark:text-gray-400 sm:inline">
                {user.name}
              </span>
              <button
                ref={logoutPress.ref}
                {...logoutPress.handlers}
                type="button"
                onClick={handleLogout}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
