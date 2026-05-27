import axios from "axios";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000/api";
const AUTH_TOKEN_KEY = "sd_auth_token";
const ADMIN_TOKEN_KEY = "sd_admin_token";

function getAuthToken() {
  return (
    localStorage.getItem(AUTH_TOKEN_KEY) ||
    sessionStorage.getItem(AUTH_TOKEN_KEY)
  );
}

function getAdminToken() {
  return (
    localStorage.getItem(ADMIN_TOKEN_KEY) ||
    sessionStorage.getItem(ADMIN_TOKEN_KEY)
  );
}

function createAuthHeaders() {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing auth token. Please login again.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

function createAdminHeaders() {
  const token = getAdminToken();
  if (!token) {
    throw new Error("Missing admin token. Please login again.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function loginRequest({ email, password }) {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email,
      password,
    });
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to login. Please check backend and try again.";
    throw new Error(message);
  }
}

export async function adminLoginRequest({ email, password }) {
  try {
    const response = await axios.post(`${API_BASE_URL}/admin/login`, {
      email,
      password,
    });
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message || "Unable to login as admin right now.";
    throw new Error(message);
  }
}

export async function fetchCurrentUser() {
  try {
    const response = await axios.get(`${API_BASE_URL}/auth/me`, {
      headers: createAuthHeaders(),
    });
    return response.data.user;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to fetch user profile right now.";
    throw new Error(message);
  }
}

export async function consumeDenoiseCredits() {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/auth/credits/use`,
      {},
      {
        headers: createAuthHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message || "Unable to consume credits right now.";
    const customError = new Error(message);
    customError.code = error?.response?.status;
    customError.credits = error?.response?.data?.credits;
    customError.requiredCredits = error?.response?.data?.requiredCredits;
    throw customError;
  }
}

export async function fetchCreditPackages() {
  try {
    const response = await axios.get(`${API_BASE_URL}/payments/packages`, {
      headers: createAuthHeaders(),
    });
    return response.data.packages || [];
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to fetch credit packages right now.";
    throw new Error(message);
  }
}

export async function initiateKhaltiPayment({ packageId }) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/payments/khalti/initiate`,
      { packageId },
      {
        headers: createAuthHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to initiate Khalti payment right now.";
    throw new Error(message);
  }
}

export async function confirmKhaltiPayment({ pidx }) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/payments/khalti/confirm`,
      { pidx },
      {
        headers: createAuthHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to confirm Khalti payment right now.";
    throw new Error(message);
  }
}

export async function registerRequest({ email, password }) {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/register`, {
      email,
      password,
    });
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to register. Please check backend and try again.";
    throw new Error(message);
  }
}

export async function forgotPasswordRequest({ email }) {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/forgot-password`, {
      email,
    });
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to process forgot password request right now.";
    throw new Error(message);
  }
}

export async function resetPasswordRequest({ email, token, newPassword }) {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/reset-password`, {
      email,
      token,
      newPassword,
    });
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message || "Unable to reset password right now.";
    throw new Error(message);
  }
}

export async function createAudioHistoryEntry(payload) {
  try {
    const response = await axios.post(`${API_BASE_URL}/history`, payload, {
      headers: createAuthHeaders(),
    });
    return response.data.entry;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to save audio history entry right now.";
    throw new Error(message);
  }
}

export async function uploadHistoryAssets({ originalFile, denoisedBlob }) {
  const formData = new FormData();
  formData.append(
    "original",
    originalFile,
    originalFile.name || "original.wav",
  );
  if (denoisedBlob) {
    formData.append("denoised", denoisedBlob, "denoised.wav");
  }

  try {
    const response = await axios.post(
      `${API_BASE_URL}/history/upload-assets`,
      formData,
      {
        headers: {
          ...createAuthHeaders(),
        },
      },
    );
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to upload audio assets for history playback.";
    throw new Error(message);
  }
}

export async function fetchAudioHistory(limit = 8) {
  try {
    const response = await axios.get(`${API_BASE_URL}/history`, {
      params: { limit },
      headers: createAuthHeaders(),
    });
    return response.data.history || [];
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to fetch audio history right now.";
    throw new Error(message);
  }
}

export async function deleteAudioHistoryEntry(historyId) {
  try {
    await axios.delete(`${API_BASE_URL}/history/${historyId}`, {
      headers: createAuthHeaders(),
    });
    return true;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to delete audio history entry right now.";
    throw new Error(message);
  }
}

export async function fetchAdminUsers(limit = 200) {
  try {
    const response = await axios.get(`${API_BASE_URL}/admin/users`, {
      params: { limit },
      headers: createAdminHeaders(),
    });
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      "Unable to fetch admin user list right now.";
    throw new Error(message);
  }
}
