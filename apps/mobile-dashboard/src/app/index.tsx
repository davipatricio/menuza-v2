import { Redirect } from "expo-router";

import { LoginForm } from "@/components/login-form.tsx";
import { Loading } from "@/components/screen.tsx";
import { useSession } from "@/lib/session.tsx";

export default function IndexRoute() {
  const { status, storeSlug } = useSession();

  if (status === "loading") return <Loading />;

  if (status === "anonymous") return <LoginForm />;

  if (!storeSlug) return <Redirect href="/stores" />;

  return <Redirect href="/(tabs)/inicio" />;
}
