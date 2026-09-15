export interface ComingSoonProps {
  title: string;
  description: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}
