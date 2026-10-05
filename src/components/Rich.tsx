/** Text with `backticked` spans rendered as inline code (Claude's answers use them for identifiers). */
export default function Rich({ text }: { text: string }) {
  return <>{text.split(/`([^`]+)`/g).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</>;
}
