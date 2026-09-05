'use client';

import authUtils from '@/lib/auth';
import { setStoredAccessToken } from '@/lib/api';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import { useRouter } from 'next/navigation';
import {
  useState,
  useEffect,
  useContext,
  createContext,
  useCallback,
} from 'react';
import { toast } from 'sonner';

interface AuthContextState {
  user: {
    username: string;
    email: string;
    joinedAt: Date;
  };
  authenticated: boolean;
  initialized: boolean;
  error: boolean;
}
interface AuthContextMethods {
  login: (_email: string, _password: string) => Promise<boolean>;
  signup: (_email: string, _password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (_data: Partial<{ username: string; email: string }>) => void;
}

const initialAuthState: AuthContextState = {
  user: {
    username: '',
    email: '',
    joinedAt: new Date(),
  },
  authenticated: false,
  initialized: false,
  error: false,
};

const AuthContext = createContext({
  state: initialAuthState,
  methods: {
    login: async (_email: string, _password: string) => {
      // Default implementation - will be overridden by actual methods
      return false;
    },
    signup: async (_email: string, _password: string) => {
      // Default implementation - will be overridden by actual methods
    },
    logout: async () => {
      // Default implementation - will be overridden by actual methods
    },
    updateUser: (_data: Partial<{ username: string; email: string }>) => {
      // Default implementation - will be overridden by actual methods
    },
  },
});

export function AuthContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialAuthState);

  useEffect(() => {
    // get user data
    getUserInfoFromServer();
  }, []);

  const updateUser = useCallback(
    (data: Partial<{ username: string; email: string }>) => {
      setState({ ...state, user: { ...state.user, ...data } });
    },
    [state]
  );

  const methods: AuthContextMethods = {
    login,
    signup,
    logout,
    updateUser,
  };

  const DEV_CREDENTIALS = {
    email: 'test@example.com',
    password: 'Test1234!',
  };

  function applyDevOfflineUser(
    userInfo: AuthContextState,
    email = DEV_CREDENTIALS.email
  ) {
    userInfo.user.username = 'testuser';
    userInfo.user.email = email;
    userInfo.user.joinedAt = new Date();
    userInfo.authenticated = true;
    userInfo.initialized = true;
    userInfo.error = false;
  }

  async function getUserInfoFromServer() {
    const response = await authUtils.fetchCurrentUser();

    const userInfo: AuthContextState = {
      authenticated: false,
      user: {
        username: '',
        email: '',
        joinedAt: new Date(),
      },
      initialized: true,
      error: false,
    };

    if (response && response.data && response.data.user) {
      const user = response.data.user;
      userInfo.user.username = user.username;
      userInfo.user.email = user.email;
      userInfo.user.joinedAt = user.createdAt;
      userInfo.authenticated = true;
      userInfo.initialized = true;
      const token = (response.data as { accessToken?: string }).accessToken;
      if (token) setStoredAccessToken(token);
    } else if (process.env.NODE_ENV === 'development') {
      // Session-Restore für lokale Demo wenn /user 401 (DB offline / kein Token)
      applyDevOfflineUser(userInfo);
    } else {
      userInfo.authenticated = false;
      userInfo.initialized = true;
      userInfo.error = !!response;
      UserLocalStorage.clearAll();
      router.push('/login');
    }

    setState({ ...userInfo });
  }

  async function login(email: string, password: string, reload = true) {
    let response;
    try {
      response = await authUtils.login({
        email,
        password,
      });
    } catch {
      response = null;
    }

    const userInfo: AuthContextState = {
      authenticated: false,
      user: {
        username: '',
        email: '',
        joinedAt: new Date(),
      },
      initialized: true,
      error: false,
    };

    if (response && response.status && response.status < 400 && response.data?.user) {
      const user = response.data.user;
      userInfo.user.username = user.username;
      userInfo.user.email = user.email;
      userInfo.user.joinedAt = user.createdAt;
      userInfo.authenticated = true;
      userInfo.initialized = true;
      const token = (response.data as { accessToken?: string }).accessToken;
      if (token) setStoredAccessToken(token);
    } else if (
      process.env.NODE_ENV === 'development' &&
      email === DEV_CREDENTIALS.email &&
      password === DEV_CREDENTIALS.password
    ) {
      applyDevOfflineUser(userInfo, email);
    } else {
      userInfo.authenticated = false;
      userInfo.initialized = false;
      userInfo.error = !!response;
      toast.error('Login failed', {
        description: 'Invalid email or password. Please try again.',
      });
    }

    setState({ ...userInfo });
    if (reload) {
      //window.location.href = "/";
    }
    return userInfo.authenticated;
  }

  async function signup(email: string, password: string, reload = true) {
    const response = await authUtils.signup({
      email,
      password,
    });
    const userInfo: AuthContextState = {
      authenticated: false,
      user: {
        username: '',
        email: '',
        joinedAt: new Date(),
      },
      initialized: true,
      error: false,
    };

    if (response && response.data && response.data.user) {
      const user = response.data.user;
      userInfo.user.username = user.username;
      userInfo.user.email = user.email;
      userInfo.user.joinedAt = user.createdAt;
      userInfo.authenticated = true;
      userInfo.initialized = true;
      const token = (response.data as { accessToken?: string }).accessToken;
      if (token) setStoredAccessToken(token);
    } else {
      userInfo.authenticated = false;
      userInfo.initialized = false;
      userInfo.error = !!response;
    }

    setState({ ...userInfo });
    if (reload) {
      //window.location.href = "/";
    }
  }

  async function logout() {
    setStoredAccessToken(null);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore errors
    }
    setState({ ...initialAuthState, initialized: true });
    UserLocalStorage.clearAll();
    // Optionally reload or redirect
    window.location.href = '/login';
  }
  return (
    <AuthContext.Provider value={{ state, methods }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('`useAuthContext` must be used within AuthContextProvider');
  }
  return context;
}
