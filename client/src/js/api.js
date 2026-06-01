import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('tp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('tp_token')
      localStorage.removeItem('tp_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const register = (data) => api.post('/auth/register', data)
export const login = (data) => api.post('/auth/login', data)

// Upload immagine
export const uploadImage = (file) => {
  const form = new FormData()
  form.append('image', file)
  return api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

// Trips
export const getTrips = () => api.get('/trips')
export const createTrip = (data) => api.post('/trips', data)
export const getTrip = (id) => api.get(`/trips/${id}`)
export const updateTrip = (id, data) => api.put(`/trips/${id}`, data)
export const deleteTrip = (id) => api.delete(`/trips/${id}`)
export const inviteToTrip = (id, data) => api.post(`/trips/${id}/invite`, data)
export const updateParticipantRole = (tripId, userId, data) => api.put(`/trips/${tripId}/participants/${userId}`, data)
export const removeParticipant = (tripId, userId) => api.delete(`/trips/${tripId}/participants/${userId}`)
export const cancelInvitation = (tripId, email) => api.delete(`/trips/${tripId}/invitations/${encodeURIComponent(email)}`)

// Days
export const getDays = (tripId) => api.get(`/trips/${tripId}/days`)
export const updateDay = (tripId, dayId, data) => api.put(`/trips/${tripId}/days/${dayId}`, data)
export const addActivity = (tripId, dayId, data) => api.post(`/trips/${tripId}/days/${dayId}/slots`, data)
export const updateActivity = (tripId, dayId, actId, data) => api.put(`/trips/${tripId}/days/${dayId}/activities/${actId}`, data)
export const deleteActivity = (tripId, dayId, actId) => api.delete(`/trips/${tripId}/days/${dayId}/activities/${actId}`)
export const reorderActivities = (tripId, dayId, order) => api.patch(`/trips/${tripId}/days/${dayId}/activities/reorder`, { order })

// Wishlist
export const getWishlist = (tripId, params) => api.get(`/trips/${tripId}/wishlist`, { params })
export const addToWishlist = (tripId, data) => api.post(`/trips/${tripId}/wishlist`, data)
export const importFromMaps = (tripId, data) => api.post(`/trips/${tripId}/wishlist/import`, data)
export const updateWishlistPlace = (tripId, placeId, data) => api.put(`/trips/${tripId}/wishlist/${placeId}`, data)
export const deleteWishlistPlace = (tripId, placeId) => api.delete(`/trips/${tripId}/wishlist/${placeId}`)

// Budget
export const getBudget = (tripId) => api.get(`/trips/${tripId}/budget`)
export const addExpense = (tripId, data) => api.post(`/trips/${tripId}/budget`, data)
export const updateExpense = (tripId, entryId, data) => api.put(`/trips/${tripId}/budget/${entryId}`, data)
export const deleteExpense = (tripId, entryId) => api.delete(`/trips/${tripId}/budget/${entryId}`)
export const updateTotalBudget = (tripId, data) => api.put(`/trips/${tripId}/budget/total`, data)

// Cities
export const getCities = (tripId) => api.get(`/trips/${tripId}/cities`)
export const addCity = (tripId, data) => api.post(`/trips/${tripId}/cities`, data)
export const updateCity = (tripId, cityId, data) => api.put(`/trips/${tripId}/cities/${cityId}`, data)
export const deleteCity = (tripId, cityId) => api.delete(`/trips/${tripId}/cities/${cityId}`)

// Packing list
export const getPacking = (tripId) => api.get(`/trips/${tripId}/packing`)
export const addPackingItem = (tripId, data) => api.post(`/trips/${tripId}/packing`, data)
export const updatePackingItem = (tripId, itemId, data) => api.put(`/trips/${tripId}/packing/${itemId}`, data)
export const deletePackingItem = (tripId, itemId) => api.delete(`/trips/${tripId}/packing/${itemId}`)

// Polling version
export const getTripVersion = (tripId) => api.get(`/trips/${tripId}/version`)

// Invite link
export const generateInviteLink = (tripId) => api.post(`/trips/${tripId}/invite-link`)
export const revokeInviteLink = (tripId) => api.delete(`/trips/${tripId}/invite-link`)
export const joinViaLink = (token) => api.post(`/trips/join/${token}`)

// Public share
export const toggleShareLink = (tripId) => api.post(`/trips/${tripId}/share`)
export const getPublicTrip = (token) => axios.create({ baseURL: '/api' }).get(`/share/${token}`)

// Clone trip
export const cloneTrip = (id) => api.post(`/trips/${id}/clone`)

// Trip notepad
export const updateTripNotes = (id, notes) => api.patch(`/trips/${id}/notes`, { notes })

// Activity completion
export const toggleActivityComplete = (tripId, dayId, actId, completed) =>
  api.patch(`/trips/${tripId}/days/${dayId}/activities/${actId}/complete`, { completed })

// Wishlist vote (toggle)
export const toggleWishlistVote = (tripId, placeId) =>
  api.post(`/trips/${tripId}/wishlist/${placeId}/vote`)

// Travel photos
export const getTripPhotos = (tripId) => api.get(`/trips/${tripId}/photos`)
export const uploadTripPhoto = (tripId, file, dayId, activityId, caption) => {
  const form = new FormData()
  form.append('image', file)
  form.append('day_id', dayId)
  if (activityId) form.append('activity_id', activityId)
  if (caption) form.append('caption', caption)
  return api.post(`/trips/${tripId}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const deleteTripPhoto = (tripId, photoId) => api.delete(`/trips/${tripId}/photos/${photoId}`)

// Attachments
export const getAttachments = (tripId) => api.get(`/trips/${tripId}/attachments`)
export const uploadAttachment = (tripId, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/trips/${tripId}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const deleteAttachment = (tripId, attId) => api.delete(`/trips/${tripId}/attachments/${attId}`)

export default api
