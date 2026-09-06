import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

const user = {
  username: "Local",
  email: "local@dadix.app",
  joinedAt: new Date(),
};

const AuthContext = createContext({
  state: {
    user,
    authenticated: true,
    initialized: true,
    error: false,
  },
  methods: {
    login: async () => true,
    signup: async () => undefined,
    logout: async () => undefined,
    updateUser: (_data: Partial<{ username: string; email: string }>) => undefined,
  },
});

export function AuthContextProvider({ children }: { children: ReactNode }) {
  const methods = useMemo(
    () => ({
      login: async () => true,
      signup: async () => undefined,
      logout: async () => undefined,
      updateUser: (_data: Partial<{ username: string; email: string }>) => undefined,
    }),
    []
  );
  return (
    <AuthContext.Provider value={{ state: { user, authenticated: true, initialized: true, error: false }, methods }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}

export const useAuth = useAuthContext;
