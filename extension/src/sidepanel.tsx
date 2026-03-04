import { useState } from "react"

import "./style.css"

import Chat from "./components/sidepanel/Chat"
import FillForm from "./components/sidepanel/FillForm"
import Resume from "./components/sidepanel/Resume"
import TrackerTable from "./components/sidepanel/TrackerTable"

type Tab = "fill-form" | "resume" | "tracker" | "chat"

const tabs: { id: Tab; label: string }[] = [
  { id: "fill-form", label: "Fill Form" },
  { id: "resume", label: "Resume" },
  { id: "tracker", label: "Tracker" },
  { id: "chat", label: "Chat" }
]

function SidePanel() {
  const [activeTab, setActiveTab] = useState<Tab>("fill-form")

  return (
    <div className="flex flex-col h-screen bg-white">
      <nav className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-auto p-4">
        {activeTab === "fill-form" && <FillForm />}
        {activeTab === "resume" && <Resume />}
        {activeTab === "tracker" && <TrackerTable />}
        {activeTab === "chat" && <Chat />}
      </main>
    </div>
  )
}

export default SidePanel
