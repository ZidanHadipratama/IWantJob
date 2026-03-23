import { expect, test } from "./fixtures"
import {
  buildDemoSeed,
  buildFillFormSession,
  buildResumeSession,
  buildTailoredContext,
  captureComposedFrame,
  captureFrame,
  DEMO_BASE_URL,
  ensureCleanFrameDir,
  getDemoAnswers,
  installDemoApiMocks,
  seedExtensionStorage,
  sendMessageToDemoTab
} from "./demo-capture.helpers"

test.describe.configure({ mode: "serial" })

test("capture settings-and-bootstrap clip frames", async ({ context, extensionId, page }) => {
  await ensureCleanFrameDir("settings-and-bootstrap")
  await installDemoApiMocks(context)

  await page.setViewportSize({ width: 1280, height: 960 })
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await seedExtensionStorage(page, buildDemoSeed())

  await page.getByRole("button", { name: "Settings" }).click()
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()

  await captureFrame(page, "settings-and-bootstrap", 0, "settings-initial")

  await page.getByRole("button", { name: "Test Backend" }).click()
  await expect(page.getByText("Backend is reachable")).toBeVisible()
  await captureFrame(page, "settings-and-bootstrap", 1, "backend-healthy")

  await page.getByRole("button", { name: "Test Connection" }).click()
  await expect(page.getByText("Supabase connection healthy")).toBeVisible()
  await captureFrame(page, "settings-and-bootstrap", 2, "database-healthy")

  await page.getByRole("button", { name: "Test Active Models" }).click()
  await expect(page.getByText("Default: Model replied OK")).toBeVisible()
  await page.getByRole("button", { name: /Need help creating one\?/ }).click()
  await expect(page.getByRole("button", { name: "Copy Prompt" })).toBeVisible()
  await captureFrame(page, "settings-and-bootstrap", 3, "ai-and-persona")
})

test("capture resume-to-fill-flow clip frames", async ({ context, extensionId, page }) => {
  await ensureCleanFrameDir("resume-to-fill-flow")
  await installDemoApiMocks(context)

  await page.setViewportSize({ width: 1360, height: 900 })
  await page.goto(`${DEMO_BASE_URL}/job-posting.html`)
  await expect(page.getByRole("heading", { name: "Full Stack Product Engineer" })).toBeVisible()

  const sidepanelPage = await context.newPage()
  await sidepanelPage.setViewportSize({ width: 420, height: 900 })
  await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await seedExtensionStorage(
    sidepanelPage,
    buildDemoSeed({
      active_job_context: buildTailoredContext(),
      resume_session: buildResumeSession(),
      sidepanel_active_tab: "resume",
      fillform_session: null
    })
  )

  await expect(sidepanelPage.getByRole("button", { name: "Continue to Fill Form" })).toBeVisible()
  await captureComposedFrame(page, sidepanelPage, "resume-to-fill-flow", 0, "resume-tailored")

  await sidepanelPage.getByRole("button", { name: "Continue to Fill Form" }).click()
  await expect(sidepanelPage.getByRole("button", { name: "Get Form Fields" })).toBeVisible()
  await captureComposedFrame(page, sidepanelPage, "resume-to-fill-flow", 1, "fill-form-handoff")
  await sidepanelPage.close()
})

test("capture fill-form-and-autofill clip frames", async ({ context, extensionId, page }) => {
  await ensureCleanFrameDir("fill-form-and-autofill")
  await installDemoApiMocks(context)

  await page.setViewportSize({ width: 1360, height: 940 })
  await page.goto(`${DEMO_BASE_URL}/application-form.html`)
  await expect(page.getByRole("heading", { name: "Apply for Full Stack Product Engineer" })).toBeVisible()

  const extensionPage = await context.newPage()
  await extensionPage.setViewportSize({ width: 420, height: 940 })
  await extensionPage.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  const extractResponse = await sendMessageToDemoTab(extensionPage, `${DEMO_BASE_URL}/application-form.html`, "EXTRACT_FORM")
  const extractedFields = Array.isArray(extractResponse.fields) ? extractResponse.fields : []

  await seedExtensionStorage(
    extensionPage,
    buildDemoSeed({
      active_job_context: buildTailoredContext(),
      resume_session: buildResumeSession(),
      fillform_session: buildFillFormSession(extractedFields),
      sidepanel_active_tab: "fill-form"
    })
  )

  await expect(extensionPage.getByText("Persona context is active.")).toBeVisible()
  await captureComposedFrame(page, extensionPage, "fill-form-and-autofill", 0, "fill-form-answers")

  await sendMessageToDemoTab(extensionPage, `${DEMO_BASE_URL}/application-form.html`, "AUTOFILL_FORM", {
    fields: extractedFields,
    answers: getDemoAnswers()
  })

  await expect(page.locator("#firstname")).toHaveValue("Mochamad Zidan")
  await expect(page.locator("#experience_level")).toHaveValue("3-5")
  await expect(page.locator('input[name="react_typescript"][value="yes"]')).toBeChecked()
  await captureComposedFrame(page, extensionPage, "fill-form-and-autofill", 1, "form-autofilled")
  await extensionPage.close()
})

test("capture save-and-tracker-workspace clip frames", async ({ context, extensionId, page }) => {
  await ensureCleanFrameDir("save-and-tracker-workspace")
  await installDemoApiMocks(context)

  const formPage = await context.newPage()
  await formPage.setViewportSize({ width: 1360, height: 900 })
  await formPage.goto(`${DEMO_BASE_URL}/application-form.html`)
  await expect(formPage.getByRole("heading", { name: "Apply for Full Stack Product Engineer" })).toBeVisible()

  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await seedExtensionStorage(
    page,
    buildDemoSeed({
      active_job_context: buildTailoredContext(),
      resume_session: buildResumeSession(),
      fillform_session: buildFillFormSession([]),
      sidepanel_active_tab: "fill-form"
    })
  )

  await expect(page.getByRole("button", { name: "Save to Tracker" })).toBeVisible()
  await captureComposedFrame(formPage, page, "save-and-tracker-workspace", 0, "ready-to-save")

  await page.getByRole("button", { name: "Save to Tracker" }).click()
  await expect(page.getByText(/Saved to tracker with/)).toBeVisible()
  await captureComposedFrame(formPage, page, "save-and-tracker-workspace", 1, "saved-from-fill-form")

  const optionsPage = await context.newPage()
  await optionsPage.setViewportSize({ width: 1780, height: 980 })
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`)
  await seedExtensionStorage(optionsPage, buildDemoSeed())
  await expect(optionsPage.getByRole("heading", { name: "Application Tracker" })).toBeVisible()
  await captureFrame(optionsPage, "save-and-tracker-workspace", 2, "tracker-list")

  await optionsPage.getByRole("button", { name: "Open" }).click()
  await expect(optionsPage.getByRole("heading", { name: "Tailored Resume" })).toBeVisible()
  await captureFrame(optionsPage, "save-and-tracker-workspace", 3, "job-detail")
  await optionsPage.close()
  await formPage.close()
})

test("capture advanced-form-support clip frames", async ({ context, extensionId, page }) => {
  await ensureCleanFrameDir("advanced-form-support")
  await installDemoApiMocks(context)

  await page.setViewportSize({ width: 1360, height: 940 })
  await page.goto(`${DEMO_BASE_URL}/iframe-host.html`)
  await page.getByRole("button", { name: "Apply now" }).click()
  const modalCard = page.locator(".modal-card")
  await expect(modalCard).toBeVisible()

  const extensionPage = await context.newPage()
  await extensionPage.setViewportSize({ width: 420, height: 940 })
  await extensionPage.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  const extractResponse = await sendMessageToDemoTab(extensionPage, `${DEMO_BASE_URL}/iframe-host.html`, "EXTRACT_FORM")
  const extractedFields = Array.isArray(extractResponse.fields) ? extractResponse.fields : []
  await captureComposedFrame(page, extensionPage, "advanced-form-support", 0, "iframe-modal")
  await sendMessageToDemoTab(extensionPage, `${DEMO_BASE_URL}/iframe-host.html`, "AUTOFILL_FORM", {
    fields: extractedFields,
    frame_id: extractResponse.frame_id,
    answers: [
      { field_id: "iframe_firstname", label: "First name", answer: "Mochamad Zidan", field_type: "text" },
      { field_id: "iframe_lastname", label: "Last name", answer: "Hadipratama", field_type: "text" },
      { field_id: "iframe_email", label: "Email", answer: "zidan@example.com", field_type: "text" },
      { field_id: "rag_experience", label: "Do you have experience with RAG systems?", answer: "Yes", field_type: "radio" },
      { field_id: "iframe_cover_letter", label: "Why are you a strong fit?", answer: "I care about reliable applied AI systems and polished product delivery.", field_type: "textarea" }
    ]
  })

  const embedded = page.frameLocator('iframe[title="Embedded application form"]')
  await expect(embedded.locator("#iframe_firstname")).toHaveValue("Mochamad Zidan")
  await expect(embedded.locator('input[name="rag_experience"][value="yes"]')).toBeChecked()
  await captureComposedFrame(page, extensionPage, "advanced-form-support", 1, "iframe-autofilled")
  await extensionPage.close()
})
