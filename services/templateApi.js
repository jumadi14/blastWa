// 📁 /wa-blast-frontend/src/services/templateApi.js

const API_BASE_URL = "http://localhost:3000/api";

/**
 * Utility umum untuk request API dengan dukungan Authorization token dan JSON handler.
 */
async function apiRequest(endpoint, method = "GET", data = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = localStorage.getItem("token");

    const config = {
        method,
        headers: {
            "Content-Type": "application/json",
        },
    };

    if (token) {
        config.headers["Authorization"] = `Bearer ${token}`;
    }

    if (data) {
        config.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, config);
        const responseData =
            response.status === 204 ? { success: true } : await response.json();

        // Handle token expired
        if (response.status === 401) {
            console.warn("⚠️ Token invalid/expired, redirect ke login...");
            localStorage.removeItem("token");
            window.location.href = "/login";
            throw new Error("Token expired. Silakan login ulang.");
        }

        if (!response.ok) {
            throw new Error(responseData.error || `API Error: ${response.status}`);
        }

        return responseData;
    } catch (err) {
        console.error(`❌ Error in ${method} ${url}:`, err);
        throw err;
    }
}

// =========================================================
// 💬 TEMPLATE MANAGEMENT API
// =========================================================

/**
 * 🔹 Ambil semua template
 * Endpoint: GET /api/template
 */
export const getAllTemplates = async () => {
    return apiRequest("/template", "GET");
};

/**
 * 🔹 Buat template baru
 * Endpoint: POST /api/template
 */
export const createTemplate = async (name, message_body) => {
    return apiRequest("/template", "POST", { name, message_body });
};

/**
 * 🔹 Update template
 * Endpoint: PUT /api/template/:id
 */
export const updateTemplate = async (id, name, message_body) => {
    return apiRequest(`/template/${id}`, "PUT", { name, message_body });
};

/**
 * 🔹 Hapus template
 * Endpoint: DELETE /api/template/:id
 */
export const deleteTemplate = async (id) => {
    return apiRequest(`/template/${id}`, "DELETE");
};

