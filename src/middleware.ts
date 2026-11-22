import { NextResponse } from "next/server";
import { errorResponse, guardAccess } from "./server/http";

export function middleware(request: Request): Response {
  try {
    guardAccess(request);
    return NextResponse.next();
  } catch (error) {
    return errorResponse(error);
  }
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon\\.svg|\\.well-known/workflow/).*)"],
  runtime: "nodejs",
};
