import { createContext, useContext, useEffect, useState } from "react";
import * as api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(api.getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!api.getToken());

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .getCurrentUser()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [token]);

  async function login(credentials) {
    await api.login(credentials);
    setToken(api.getToken());
  }

  async function register(details) {
    await api.register(details);
    setToken(api.getToken());
  }

  function logout() {
    api.clearToken();
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
