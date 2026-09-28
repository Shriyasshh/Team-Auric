import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register'
  
  if (
    !user &&
    !isAuthRoute &&
    request.nextUrl.pathname !== '/'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user) {
    // If logged in, get user role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role

    // Role-based routing
    if (isAuthRoute) {
      if (role === 'PATIENT') return NextResponse.redirect(new URL('/patient/dashboard', request.url))
      if (role === 'DOCTOR') return NextResponse.redirect(new URL('/doctor/dashboard', request.url))
      if (role === 'ADMIN') return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }

    if (request.nextUrl.pathname.startsWith('/patient') && role !== 'PATIENT') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (request.nextUrl.pathname.startsWith('/doctor') && role !== 'DOCTOR') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return supabaseResponse
}
