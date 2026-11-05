export function solidVertices<T>(type:string,vertices:T[]):T[]{return vertices.length===4&&['SOLID','TRACE'].includes(type)?[vertices[0],vertices[1],vertices[3],vertices[2]]:vertices;}
