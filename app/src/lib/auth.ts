import axios from 'axios';
import { callApi } from '@/lib/api';

const fetchCurrentUser = async () => {
  try {
    const result = await callApi.get('/user');
    return result;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return err.response;
    }
    console.error('An unexpected error occurred:', err);
    throw err;
  }
};

const updateCurrentUser = async ({
  data,
  password = undefined,
}: {
  data: Record<string, unknown>;
  password?: string;
}) => {
  return await callApi
    .patch('/user', {
      password,
      data,
    })
    .then((res) => {
      return res;
    })
    .catch((err) => {
      console.error(err);
      return err;
    });
};

const login = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  try {
    const result = await callApi('/auth/login', {
      method: 'POST',
      data: {
        email,
        passcode: password,
      },
    });
    return result;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return err.response;
    }
    console.error('An unexpected error occurred:', err);
    throw err;
  }
};

const signup = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  try {
    const result = await callApi('/auth/signup', {
      method: 'POST',
      data: {
        email,
        passcode: password,
      },
    });
    return result;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return err.response;
    }
    console.error('An unexpected error occurred:', err);
    throw err;
  }
};

const deleteCurrentUser = async ({ password }: { password: string }) => {
  return await callApi
    .post('/user/delete', {
      password,
    })
    .then((res) => {
      return res;
    })
    .catch((err) => {
      console.error(err);
      return err;
    });
};

const authService = {
  fetchCurrentUser,
  login,
  signup,
  updateCurrentUser,
  deleteCurrentUser,
};

export default authService;
