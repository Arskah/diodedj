<script lang="ts">
  let { message = "An error occurred", type = "error" as "error" | "warning" } =
    $props();
</script>

<div
  class="error-banner {type === 'warning' ? 'warning' : ''}"
  role={type === "warning" ? "status" : "alert"}
  aria-live={type === "warning" ? "polite" : "assertive"}
>
  <span class="material-symbols-outlined" aria-hidden="true">
    {type === "warning" ? "sync" : "warning"}
  </span>
  <span class="message">{message}</span>
</div>
