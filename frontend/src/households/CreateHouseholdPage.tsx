import { CreateHouseholdForm } from './CreateHouseholdForm'

export function CreateHouseholdPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Create your household</h1>
          <p className="text-sm text-slate-500">
            You'll be its admin, and any member you add later can view and edit its plans.
          </p>
        </div>
        <CreateHouseholdForm />
      </div>
    </div>
  )
}
