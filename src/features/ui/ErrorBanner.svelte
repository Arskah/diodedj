<script lang="ts">
  let { message = "An error occurred", type = "error" as "error" | "warning" } =
    $props();
</script>

<div
  class="error-banner {type === 'warning' ? 'warning' : ''}"
  role={type === "warning" ? "status" : "alert"}
  aria-live={type === "warning" ? "polite" : "assertive"}
>
  <div class="content">
    <span class="icon">{type === "warning" ? "⚠" : "⛔"}</span>
    <span class="message">{message}</span>
  </div>
</div>

<style>
  .error-banner {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    background-color: #fee2e2;
    border: 1px solid #ef4444;
    color: #991b1b;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
  }

  .error-banner.warning {
    background-color: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }

  .content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .icon {
    font-size: 1.1em;
  }
</style>
