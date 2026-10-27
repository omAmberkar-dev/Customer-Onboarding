import { documentTypes } from '../data/documentTypes'

// Ids that name one document row for the preview: a file picked in this session ("new:<type>:<index>") or an uploaded one ("up:<blob>").
export const newDocumentId = (type, index) => `new:${type}:${index}`
export const uploadedDocumentId = (file) => `up:${file.blob_name || file.original_name}`

// Every document currently listed in the form, in the order of the document types. `documents` are the files picked in this session that
// are not uploaded yet (uploading, or failed). A one-file type shows them instead of the uploaded file (they replace it); a type that takes
// several files lists the uploaded ones and then these. `saved` is false for files not uploaded.
export function documentPreviewItems(documents = {}, existing = {}) {
  const items = []
  for (const { key, label, max } of documentTypes) {
    const picked = documents[key] || []
    if (max > 1) {
      for (const file of existing[key] || []) {
        items.push({ id: uploadedDocumentId(file), type: key, typeLabel: label, name: file.original_name, size: file.size, saved: true, blobName: file.blob_name })
      }
      picked.forEach((file, index) => items.push({ id: newDocumentId(key, index), type: key, typeLabel: label, name: file.name, size: file.size, saved: false, file }))
    } else if (picked.length > 0) {
      picked.forEach((file, index) => items.push({ id: newDocumentId(key, index), type: key, typeLabel: label, name: file.name, size: file.size, saved: false, file }))
    } else {
      for (const file of existing[key] || []) {
        items.push({ id: uploadedDocumentId(file), type: key, typeLabel: label, name: file.original_name, size: file.size, saved: true, blobName: file.blob_name })
      }
    }
  }
  return items
}

export const isImageName = (name) => /\.(png|jpe?g)$/i.test(String(name || ''))

// Identifies one picked file while it uploads (names can repeat, so size and date are part of it).
export const fileKey = (type, file) => `${type}:${file.name}:${file.size}:${file.lastModified}`
