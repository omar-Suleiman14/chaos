/**
 * Request-scoped memo for the bounded admin Operations page.
 *
 * Multiple enrollment requests / exam releases may refer to the same course.
 * Share the in-flight read, including concurrent calls, but never keep a cache
 * across requests: subsequent pages must observe course deletion and edits.
 */
export function memoizeCourseTitles(read: (courseId: string) => Promise<string>) {
  const inFlight = new Map<string, Promise<string>>();
  return (courseId: string): Promise<string> => {
    let value = inFlight.get(courseId);
    if (!value) {
      value = read(courseId);
      inFlight.set(courseId, value);
    }
    return value;
  };
}
