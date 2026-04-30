import { NewProjectForm } from "@/components/new-project-form";

export const metadata = { title: "New project — Papuc" };

export default function NewProjectPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <NewProjectForm />
    </div>
  );
}
