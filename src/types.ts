export type ProjectStatus = '進行中' | '完了' | '保留' | '未着手'
export type Priority = '高' | '中' | '低'

export interface Member {
  id: string
  name: string
  department: string
  role: string
  email: string
  status: '稼働中' | '休暇中' | '離席中'
  activeTasks: number
}

export interface Project {
  id: string
  name: string
  client: string
  owner: string
  status: ProjectStatus
  priority: Priority
  progress: number // 0-100
  budget: number // 円
  startDate: string // ISO
  dueDate: string // ISO
}

export interface Task {
  id: string
  title: string
  projectId: string
  assignee: string
  status: ProjectStatus
  priority: Priority
  dueDate: string // ISO
}

export interface ScheduleEvent {
  id: string
  title: string
  date: string // ISO (yyyy-MM-dd)
  category: '会議' | '締切' | '訪問' | '社内'
  time: string
}

export interface MonthlySales {
  month: string
  売上: number
  目標: number
}

export interface CategoryShare {
  name: string
  value: number
}
