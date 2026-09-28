'use client'

import { useState } from 'react'
import { register } from '@/app/auth/actions'

export default function Register() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await register(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-white border rounded-xl shadow-sm dark:bg-slate-950 dark:border-slate-800">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Create an account</h2>
          <p className="text-sm text-slate-500 mt-2">Join MediVault to securely manage medical records</p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-white bg-red-500 rounded-md">
            {error}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Full Name</label>
            <input name="fullName" type="text" required className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent mt-1" placeholder="John Doe" />
          </div>
          <div>
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Email</label>
            <input name="email" type="email" required className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent mt-1" placeholder="name@example.com" />
          </div>
          <div>
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Password</label>
            <input name="password" type="password" required className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Role</label>
            <select name="role" className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent mt-1 bg-white dark:bg-slate-950">
              <option value="patient">Patient</option>
              <option value="doctor">Doctor</option>
            </select>
          </div>
          <button type="submit" disabled={loading} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-blue-600 text-white hover:bg-blue-700 h-10 py-2 px-4 w-full">
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <div className="text-center text-sm">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-blue-600 hover:underline">
            Sign In
          </a>
        </div>
      </div>
    </div>
  );
}
