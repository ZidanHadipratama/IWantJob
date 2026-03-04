import React, { useState, useEffect, useRef, useCallback } from "react"
import { Upload, Loader, AlertCircle } from "lucide-react"
import { getStorage, setStorage } from "~lib/storage"
import { createApiClient } from "~lib/api"

interface ResumeUploadCardProps {
  onConfigChange?: (configured: boolean) => void
}

export function ResumeUploadCard({ onConfigChange }: ResumeUploadCardProps) {
  const [mode, setMode] = useState<"upload" | "paste">("upload")
  const [resumeText, setResumeText] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getStorage("base_resume_text").then((text) => {
      if (text) {
        setResumeText(text)
        onConfigChange?.(true)
        if (text.trim().length > 0) setMode("paste")
      }
    })
  }, [onConfigChange])

  const saveText = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        await setStorage("base_resume_text", text)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 1500)
        onConfigChange?.(text.trim().length > 0)
      }, 500)
    },
    [onConfigChange]
  )

  async function processFile(file: File) {
    if (!file.name.endsWith(".pdf") && file.type !== "application/pdf") {
      setUploadError("Please upload a PDF file")
      return
    }

    setIsUploading(true)
    setUploadError("")

    try {
      const client = await createApiClient()
      const result = await client.uploadResume(file)

      if (result.resume_text) {
        setResumeText(result.resume_text)
        await setStorage("base_resume_text", result.resume_text)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 1500)
        onConfigChange?.(true)
        setMode("paste") // Show the extracted text in paste mode
      } else {
        // Upload returned no text — switch to paste mode
        setUploadError(
          result.message || "PDF parsing failed. Please paste your resume text instead."
        )
        setMode("paste")
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed — switching to paste mode"
      )
      setMode("paste")
    } finally {
      setIsUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleTextChange(value: string) {
    setResumeText(value)
    saveText(value)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">Base Resume</h2>
        {savedIndicator && (
          <span className="text-xs text-green-600 font-medium">Saved</span>
        )}
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            mode === "upload"
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "text-gray-500 hover:text-gray-700"
          }`}>
          Upload PDF
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            mode === "paste"
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "text-gray-500 hover:text-gray-700"
          }`}>
          Paste Text
        </button>
      </div>

      {mode === "upload" && (
        <div>
          {/* Drag-and-drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            }`}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload resume PDF"
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm text-gray-500">Parsing PDF...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">
                  Drop your resume PDF here
                </p>
                <p className="text-xs text-gray-400">or click to browse</p>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="mt-3 flex items-start gap-2 text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{uploadError}</p>
            </div>
          )}
        </div>
      )}

      {mode === "paste" && (
        <div>
          {uploadError && (
            <div className="mb-3 flex items-start gap-2 text-orange-600">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{uploadError}</p>
            </div>
          )}
          <label
            htmlFor="resume-text"
            className="block text-sm font-medium text-gray-700 mb-1">
            Resume Text
          </label>
          <textarea
            id="resume-text"
            value={resumeText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Paste your resume text here..."
            rows={12}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            {resumeText.length > 0
              ? `${resumeText.length} characters — auto-saved`
              : "Changes are saved automatically"}
          </p>
        </div>
      )}
    </div>
  )
}
