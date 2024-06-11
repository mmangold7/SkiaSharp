using System;
using System.Threading.Tasks;
using Microsoft.JSInterop;

namespace SkiaSharp.Views.Blazor.Internal
{
	internal class JSModuleInterop : IAsyncDisposable
	{
		private readonly Task<IJSObjectReference> moduleTask;
		private IJSObjectReference? module;

		public JSModuleInterop(IJSRuntime js, string filename)
		{
			moduleTask = js.InvokeAsync<IJSObjectReference>("import", filename).AsTask();
		}

		public async Task ImportAsync()
		{
			module = await moduleTask;
		}

		public async ValueTask DisposeAsync()
		{
			await OnDisposingModuleAsync();

			if (module != null)
			{
				await module.DisposeAsync();
			}
		}

		protected IJSObjectReference Module =>
			module ?? throw new InvalidOperationException("Make sure to run ImportAsync() first.");

		protected async Task InvokeAsync(string identifier, params object?[]? args) =>
			await Module.InvokeVoidAsync(identifier, args);

		protected async Task<TValue> InvokeAsync<TValue>(string identifier, params object?[]? args) =>
			await Module.InvokeAsync<TValue>(identifier, args);

		protected virtual Task OnDisposingModuleAsync() => Task.CompletedTask;
	}
}
