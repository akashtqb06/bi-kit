import { Suspense } from "react";
import { redirect } from "next/navigation";

function RedirectToWorkbooks(): null {
  redirect("/workbooks");
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <RedirectToWorkbooks />
    </Suspense>
  );
}

