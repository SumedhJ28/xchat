import { login, signup } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message: string }>
}) {
  const params = await searchParams;
  const message = params.message;

  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto h-screen">
      <form className="flex-1 flex flex-col w-full justify-center gap-2 text-foreground">
        <h1 className="text-2xl font-semibold text-center mb-6">Welcome to Chat</h1>
        <label className="text-md font-medium" htmlFor="email">
          Email
        </label>
        <input
          className="rounded-md px-4 py-2 bg-inherit border mb-6"
          name="email"
          placeholder="you@example.com"
          required
        />
        <label className="text-md font-medium" htmlFor="password">
          Password
        </label>
        <input
          className="rounded-md px-4 py-2 bg-inherit border mb-6"
          type="password"
          name="password"
          placeholder="••••••••"
          required
        />
        <button
          formAction={login}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 mb-2 transition-colors"
        >
          Sign In
        </button>
        <button
          formAction={signup}
          className="border border-foreground/20 rounded-md px-4 py-2 text-foreground mb-2 transition-colors hover:bg-gray-800"
        >
          Sign Up
        </button>
        {message && (
          <p className="mt-4 p-4 bg-foreground/10 text-foreground text-center">
            {message}
          </p>
        )}
      </form>
    </div>
  )
}
