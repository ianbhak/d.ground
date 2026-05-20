import { redirect } from "next/navigation";

// The home page (/) is the canonical rooms dashboard for signed-in users.
export default function RoomsPage() {
  redirect("/");
}
