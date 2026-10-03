/** Source history is permanent. Cache refresh must never delete it. */
export async function DELETE() {
  return Response.json(
    { error: "Archived chat history is protected and cannot be deleted." },
    { status: 410 },
  );
}
