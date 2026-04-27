'use client'

import { useState } from 'react'
import { login, signup } from './actions'

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden">

      {/* Glow */}
      <div className="absolute w-[500px] h-[500px] bg-orange-500/20 blur-3xl rounded-full top-[-100px] left-[-100px]" />

      {/* Card */}
      <div className="relative w-full max-w-sm bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">

        <form
          action={isSignup ? signup : login}
          className="flex flex-col gap-4"
        >

          {/* Title */}
          <h1 className="text-2xl font-semibold text-white">
            {isSignup ? 'Create your account' : 'Welcome to XChat'}
          </h1>

          <p className="text-sm text-neutral-400">
            by Sumedh
          </p>

          {/* Email */}
          <input
            name="email"
            placeholder="Email address"
            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-neutral-500 focus:outline-none focus:border-orange-400"
            required
          />

          {/* Password */}
          <input
            type="password"
            name="password"
            placeholder="Password"
            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-neutral-500 focus:outline-none focus:border-orange-400"
            required
          />

          {/* Login-only section */}
          {!isSignup && (
            <p className="text-xs text-neutral-500 hover:text-white cursor-pointer">
              Forgot Password ?
            </p>
          )}

          {/* Button */}
          <button
            type="submit"
            className="mt-2 bg-gradient-to-r from-orange-500 to-orange-400 text-white py-2 rounded-lg font-medium hover:opacity-90 transition"
          >
            {isSignup ? 'Sign up' : 'Log in'}
          </button>

          {/* Toggle */}
          <p className="text-xs text-neutral-500 text-center mt-2">
            {isSignup ? 'Already have an account?' : 'New to XChat?'}{' '}
            <span
              onClick={() => setIsSignup(!isSignup)}
              className="underline cursor-pointer hover:text-white"
            >
              {isSignup ? 'Login' : 'Create account here'}
            </span>
          </p>

        </form>
      </div>
    </div>
  )
}