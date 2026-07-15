import axios from "axios";

export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const login = (email, password) =>
  api.post("/auth/login", new URLSearchParams({ username: email, password }));

export const getMe = () => api.get("/auth/me");
export const getSummary = () => api.get("/analytics/summary");
export const getEmployeeAnalytics = (id, period = "day") =>
  api.get(`/analytics/employee/${id}?period=${period}`);
export const getScreenshots = (id) => api.get(`/screenshots/${id}`);
export const getEvents = (id) => api.get(`/events/${id}`);

export default api;
