using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

const int Port = 17873;
var allowedOrigins = ReadSet("TEAM_WORKBENCH_ALLOWED_ORIGINS", "https://happy-hub-work.lovable.app;http://localhost:3000;http://localhost:5173");
var allowedHosts = ReadSet("TEAM_WORKBENCH_ALLOWED_ATTACHMENT_HOSTS", "supabase.co;supabase.in;lovable.app");
if (args.Contains("--self-test")) { HelperValidation.RunSelfTest(allowedHosts); return; }
if (!OperatingSystem.IsWindows()) { Console.Error.WriteLine("Windows is required."); return; }
using var listener = new HttpListener(); listener.Prefixes.Add($"http://127.0.0.1:{Port}/"); listener.Start();
Console.WriteLine($"Team Workbench Outlook Helper 1.0.0 listening on 127.0.0.1:{Port}");
while (true) { var context = await listener.GetContextAsync(); _ = Task.Run(() => Handle(context, allowedOrigins, allowedHosts)); }

static HashSet<string> ReadSet(string name, string fallback) => (Environment.GetEnvironmentVariable(name) ?? fallback).Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet(StringComparer.OrdinalIgnoreCase);

static async Task Handle(HttpListenerContext context, HashSet<string> origins, HashSet<string> hosts) {
  var response=context.Response; var origin=context.Request.Headers["Origin"];
  try {
    if (origin is null || !origins.Contains(origin)) { response.StatusCode=403; await Write(response,new { error="origin_not_allowed" }); return; }
    response.Headers["Access-Control-Allow-Origin"]=origin; response.Headers["Vary"]="Origin";
    response.Headers["Access-Control-Allow-Private-Network"]="true";
    response.Headers["Access-Control-Allow-Headers"]="content-type"; response.Headers["Access-Control-Allow-Methods"]="GET,POST,OPTIONS";
    if(context.Request.HttpMethod=="OPTIONS"){response.StatusCode=204;response.Close();return;}
    if(context.Request.HttpMethod=="GET" && context.Request.Url?.AbsolutePath=="/v1/health"){
      var outlook=Type.GetTypeFromProgID("Outlook.Application") is null ? "not_found" : "classic";
      await Write(response,new { status="ok",outlook,attachments=outlook=="classic",version="1.0.0" });return;
    }
    if(context.Request.HttpMethod!="POST" || context.Request.Url?.AbsolutePath!="/v1/drafts"){response.StatusCode=404;await Write(response,new {error="not_found"});return;}
    var payload=await JsonSerializer.DeserializeAsync<DraftRequest>(context.Request.InputStream,new JsonSerializerOptions{PropertyNameCaseInsensitive=true});
    var errors=await HelperValidation.Validate(payload,hosts); if(errors.Count>0){response.StatusCode=400;await Write(response,new{error="invalid_payload",details=errors});return;}
    Console.WriteLine($"draft request received; attachment count={payload!.Attachments.Count}");
    var temp=Directory.CreateTempSubdirectory("team-workbench-outlook-"); var files=new List<string>();
    try {
      using var client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(30)};
      foreach(var attachment in payload.Attachments){var target=Path.Combine(temp.FullName,$"{Guid.NewGuid():N}-{HelperValidation.SafeName(attachment.Filename)}");using var download=await client.GetAsync(attachment.DownloadUrl,HttpCompletionOption.ResponseHeadersRead);download.EnsureSuccessStatusCode();if(download.Content.Headers.ContentLength>25*1024*1024)throw new InvalidDataException("attachment_too_large");await using var input=await download.Content.ReadAsStreamAsync();await using var output=File.Create(target);await CopyLimited(input,output,25*1024*1024);files.Add(target);}
      var outlookType=Type.GetTypeFromProgID("Outlook.Application") ?? throw new UnsupportedOutlookException();
      dynamic outlook=Activator.CreateInstance(outlookType)!; dynamic mail=outlook.CreateItem(0);
      mail.To=payload.To; mail.Subject=payload.Subject;
      if(string.Equals(payload.BodyFormat,"html",StringComparison.OrdinalIgnoreCase)) mail.HTMLBody=payload.Body; else mail.Body=payload.Body;
      foreach(var file in files) mail.Attachments.Add(file); mail.Display(false);
      await Write(response,new {status="draft_displayed",attachments=files.Count}); Console.WriteLine("draft displayed successfully");
    } finally { try { temp.Delete(true); } catch { } }
  } catch(UnsupportedOutlookException){response.StatusCode=409;await Write(response,new{error="unsupported_outlook"});}
    catch(COMException){response.StatusCode=409;await Write(response,new{error="unsupported_outlook"});}
    catch(Exception error){Console.Error.WriteLine($"draft failure: {error.GetType().Name}");response.StatusCode=500;await Write(response,new{error="draft_failed"});}
}
static async Task Write(HttpListenerResponse response,object value){var bytes=JsonSerializer.SerializeToUtf8Bytes(value);response.ContentType="application/json";response.ContentLength64=bytes.Length;await response.OutputStream.WriteAsync(bytes);response.Close();}
static async Task CopyLimited(Stream input,Stream output,long limit){var buffer=new byte[81920];long total=0;int read;while((read=await input.ReadAsync(buffer))>0){total+=read;if(total>limit)throw new InvalidDataException("attachment_too_large");await output.WriteAsync(buffer.AsMemory(0,read));}}

sealed record DraftRequest(string To,string Subject,string Body,string? BodyFormat,List<DraftAttachment> Attachments);
sealed record DraftAttachment(string Filename,string DownloadUrl,string? ContentType,long Size);
sealed class UnsupportedOutlookException : Exception { }

static class HelperValidation {
  static readonly HashSet<string> Types=new(StringComparer.OrdinalIgnoreCase){"application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","image/png","image/jpeg"};
  public static async Task<List<string>> Validate(DraftRequest? request,HashSet<string> allowedHosts){var errors=new List<string>();if(request is null){errors.Add("request_required");return errors;}if(string.IsNullOrWhiteSpace(request.To)||!request.To.Contains('@'))errors.Add("to_required");if(string.IsNullOrWhiteSpace(request.Subject))errors.Add("subject_required");if(request.Attachments is null){errors.Add("attachments_required");return errors;}if(request.Attachments.Count>10)errors.Add("too_many_attachments");if(request.Attachments.Sum(x=>x.Size)>50*1024*1024)errors.Add("attachments_too_large");foreach(var item in request.Attachments){if(item.Size<0||item.Size>25*1024*1024)errors.Add("attachment_too_large");if(item.ContentType is null||!Types.Contains(item.ContentType))errors.Add("attachment_type_not_allowed");if(!Uri.TryCreate(item.DownloadUrl,UriKind.Absolute,out var uri)||uri.Scheme!="https")errors.Add("attachment_url_must_be_https");else if(!allowedHosts.Any(host=>uri.Host.Equals(host,StringComparison.OrdinalIgnoreCase)||uri.Host.EndsWith("."+host,StringComparison.OrdinalIgnoreCase)))errors.Add("attachment_host_not_allowed");else if(await ResolvesPrivate(uri.Host))errors.Add("attachment_host_private");}return errors;}
  static async Task<bool> ResolvesPrivate(string host){if(host.Equals("localhost",StringComparison.OrdinalIgnoreCase))return true;try{return (await Dns.GetHostAddressesAsync(host)).Any(IsPrivate);}catch{return true;}}
  static bool IsPrivate(IPAddress ip){if(IPAddress.IsLoopback(ip))return true;if(ip.AddressFamily==AddressFamily.InterNetwork){var b=ip.GetAddressBytes();return b[0]==10||b[0]==127||(b[0]==169&&b[1]==254)||(b[0]==172&&b[1]>=16&&b[1]<=31)||(b[0]==192&&b[1]==168);}return ip.IsIPv6LinkLocal||ip.IsIPv6SiteLocal||ip.Equals(IPAddress.IPv6Loopback);}
  public static string SafeName(string value)=>string.Concat(Path.GetFileName(value).Select(ch=>char.IsLetterOrDigit(ch)||"._-".Contains(ch)?ch:'_'));
  public static void RunSelfTest(HashSet<string> hosts){var bad=new[]{new DraftRequest("","s","b","text",[]),new DraftRequest("a@b.c","s","b","text",[new("x.pdf","http://localhost/x","application/pdf",1)]),new DraftRequest("a@b.c","s","b","text",[new("x.exe","https://example.invalid/x","application/x-msdownload",60*1024*1024)])};foreach(var test in bad)if(Validate(test,hosts).GetAwaiter().GetResult().Count==0)throw new Exception("self-test failed");if(typeof(HelperValidation).Assembly.GetTypes().Any(type=>type.GetMethods().Any(method=>method.Name.Equals("Send",StringComparison.OrdinalIgnoreCase))))throw new Exception("forbidden operation exposed");Console.WriteLine("Outlook Helper validation self-test passed");}
}
