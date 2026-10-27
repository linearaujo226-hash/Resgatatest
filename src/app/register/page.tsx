import { Suspense } from "react";
import AuthScreen from "@/components/auth-screen";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen mode="register" />
    </Suspense>
  );
}
