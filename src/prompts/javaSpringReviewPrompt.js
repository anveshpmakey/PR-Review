export const javaSpringProfile = {
  name: 'java-spring',
  focus: `This is a Java / Spring Boot backend service. In addition to general correctness, pay particular attention to architecture:
- Controllers stay thin; business logic belongs in services/domain; repositories contain persistence concerns only.
- Transactions (@Transactional) belong in the service layer; watch for self-invocation, wrong propagation, and read-only misuse.
- API contracts, DTO consistency, HTTP status codes and semantics; avoid leaking JPA entities through controllers.
- JPA usage: N+1 queries, missing pagination, eager fetching, unbounded findAll, missing indexes for new queries.
- Validation (@Valid, constraint annotations), security annotations (@PreAuthorize), and input sanitisation.
- Configuration is externalised (prefer @ConfigurationProperties over scattered @Value), no hard-coded secrets.
- Logging, tracing and error handling follow cross-cutting patterns (@ControllerAdvice, no swallowed exceptions).
- @Async/@Scheduled/blocking calls on request threads, thread-safety of singleton beans.
- Test impact: behaviour changes should come with unit/integration tests (@WebMvcTest, @DataJpaTest, etc.).`
};
