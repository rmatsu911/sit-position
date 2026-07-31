import { Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { PrivateRoute } from './auth/PrivateRoute'
import Login from './auth/Login'
import { Layout } from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Schedule from './pages/Schedule'
import CrossSchedule from './pages/schedule/CrossSchedule'
import CrossMilestones from './pages/schedule/CrossMilestones'
import ScheduleCalendar from './pages/schedule/ScheduleCalendar'
import Photos from './pages/Photos'
import Drawings from './pages/Drawings'
import Quality from './pages/Quality'
import DailyReport from './pages/DailyReport'
import Personnel from './pages/Personnel'
import Ledger from './pages/Ledger'
import Reports from './pages/Reports'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import Consultation from './pages/Consultation'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          {/* 工程管理のタブ（案件工程／横断工程／横断マイルストーン／カレンダー） */}
          <Route path="/projects/:id/schedule" element={<Schedule />} />
          <Route path="/projects/:id/schedule/cross" element={<CrossSchedule />} />
          <Route path="/projects/:id/schedule/milestones" element={<CrossMilestones />} />
          <Route path="/projects/:id/schedule/calendar" element={<ScheduleCalendar />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/schedule/cross" element={<CrossSchedule />} />
          <Route path="/schedule/milestones" element={<CrossMilestones />} />
          <Route path="/schedule/calendar" element={<ScheduleCalendar />} />
          <Route path="/photos" element={<Photos />} />
          <Route path="/drawings" element={<Drawings />} />
          <Route path="/quality" element={<Quality />} />
          <Route path="/daily-report" element={<DailyReport />} />
          <Route path="/personnel" element={<Personnel />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/consultation" element={<Consultation />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}
