import { createContext, useContext, useState, useEffect } from "react";
import { getMe } from "../api/client";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      getMe()
        .then((r) => setUser(r.data))
        .catch(() => localStorage.removeItem("token"))
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  const login = (token, userData) => {
    localStorage.setItem("token", token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, login, logout, ready }}>
      {ready ? children : null}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
