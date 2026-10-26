export const SAMPLE_DIFF = `diff --git a/src/main/java/com/acme/UserController.java b/src/main/java/com/acme/UserController.java
index 1111111..2222222 100644
--- a/src/main/java/com/acme/UserController.java
+++ b/src/main/java/com/acme/UserController.java
@@ -10,6 +10,9 @@ public class UserController {
     private final UserService service;
 
+    @Transactional
     public User get(Long id) {
-        return service.find(id);
+        String apiKey = "sk-live-1234567890";
+        System.out.println(id);
+        return service.find(id);
     }
 }
diff --git a/package-lock.json b/package-lock.json
index 3333333..4444444 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,3 +1,3 @@
 {
-  "version": "1.0.0"
+  "version": "1.0.1"
 }
diff --git a/src/new.js b/src/new.js
new file mode 100644
index 0000000..5555555
--- /dev/null
+++ b/src/new.js
@@ -0,0 +1,2 @@
+export const a = 1;
+export const b = 2;
diff --git a/old.txt b/old.txt
deleted file mode 100644
index 6666666..0000000
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
diff --git a/logo.png b/logo.png
index 7777777..8888888 100644
Binary files a/logo.png and b/logo.png differ
`;

export function samplePr(overrides = {}) {
  return {
    id: 42,
    title: 'Add user lookup',
    description: 'Adds lookup',
    state: 'OPEN',
    draft: false,
    author: { display_name: 'Dev' },
    source: { branch: { name: 'feature' }, commit: { hash: 'abcdef1234567890' }, repository: { full_name: 'ws/repo' } },
    destination: { branch: { name: 'main' }, commit: { hash: '0123456789ab' }, repository: { full_name: 'ws/repo' } },
    ...overrides
  };
}
